import "dotenv/config";
import { drizzle } from "drizzle-orm/neon-http";
import { books, physicalBooks } from "@/drizzle/schema";
import { eq, desc, sql, and, asc, like, or } from "drizzle-orm";

const db = drizzle(process.env.DATABASE_URL!);

export const createBooks = async (isbn: string, title: string, author: string, genre: string, totalCopies: number, availableCopies: number, cover: string) => {
  const book: typeof books.$inferInsert = {
    isbn,
    title,
    author,
    genre,
    totalCopies,
    availableCopies,
    cover,
  };
  try {
    const res = await db.insert(books).values(book);
    console.log(res);
    return res;
  } catch (error) {
    console.log("Something Went Wrong :", error);
    throw error;
  }
};

export async function readBooks(
  page: number = 1,
  pageSize: number = 10,
  sortField: string = "title",
  sortOrder: string = "asc",
  searchQuery: string = ""
) {
  const offset = (page - 1) * pageSize;
  const searchPattern = `%${searchQuery}%`;

  const whereClause = searchQuery
    ? or(
      like(books.title, searchPattern),
      like(books.author, searchPattern),
      like(books.isbn, searchPattern)
    )
    : undefined;

  const orderByClause = sortOrder === "desc"
    ? desc(books[sortField as keyof typeof books.$inferSelect])
    : asc(books[sortField as keyof typeof books.$inferSelect]);

  const [booksList, total] = await Promise.all([
    db
      .select()
      .from(books)
      .where(whereClause)
      .orderBy(orderByClause)
      .limit(pageSize)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)` })
      .from(books)
      .where(whereClause)
  ]);

  return {
    books: booksList,
    totalBooks: total[0].count,
    totalPages: Math.ceil(total[0].count / pageSize)
  };
}

export const updateBooks = async (id: number, totalCopies: number, availableCopies: number) => {
  try {
    const updatedBook = await db
      .update(books)
      .set({ totalCopies, availableCopies })
      .where(eq(books.id, id))
      .returning();

    return updatedBook[0];
  } catch (error) {
    console.log("Something Went Wrong :", error);
    return null;
  }
};

export const deleteBooks = async (id: number) => {
  try {
    const res = await db.delete(books).where(eq(books.id, id));
    console.log("deleteBooks:", res);
  } catch (error) {
    console.log("Something Went Wrong :", error);
  }
};

export const fetchLimitedBooks = async (limit: number) => {
  try {
    const booksData = await db.select().from(books).orderBy(desc(books.id)).limit(limit);
    return booksData;
  } catch (error) {
    console.log("Something went wrong while fetching books:", error);
    return [];
  }
};

export async function fetchBookById(id: number) {
  const result = await db.select().from(books).where(eq(books.id, id)).limit(1);

  return result[0] || null;
}

export const deletePhysicalBook = async (pid: number) => {
  try {
    // Check if the book is available (not borrowed)
    const physicalBook = await db.select().from(physicalBooks).where(eq(physicalBooks.pid, pid)).limit(1);

    if (physicalBook.length === 0) {
      throw new Error("Physical book not found");
    }

    if (physicalBook[0].borrowed) {
      throw new Error("Cannot remove a borrowed book");
    }

    // Delete the physical book
    await db.delete(physicalBooks).where(eq(physicalBooks.pid, pid));
    return true;
  } catch (error) {
    console.error("Error removing physical book:", error);
    throw error;
  }
};

export const createPhysicalBooks = async (bookId: number, borrowed: boolean, returnDate: string | null, userId: string, currTransactionId: number) => {
  try {
    const physicalBook = {
      bookId,
      borrowed,
      returnDate,
      userId,
      currTransactionId,
    };
    const [newBook] = await db.insert(physicalBooks).values(physicalBook).returning({
      pid: physicalBooks.pid,
      bookId: physicalBooks.bookId,
      borrowed: physicalBooks.borrowed,
      returnDate: physicalBooks.returnDate,
      userId: physicalBooks.userId,
      currTransactionId: physicalBooks.currTransactionId,
    });

    console.log("Created physical book:", newBook);
    return newBook;
  } catch (error) {
    console.error("Error creating physical book:", error);
    throw error;
  }
};

export const getActivePhysicalBooksCount = async (bookId: number) => {
  try {
    const result = await db
      .select()
      .from(physicalBooks)
      .where(sql`${physicalBooks.bookId} = ${bookId}`);
    return result.length;
  } catch (error) {
    console.error("Error getting physical books count:", error);
    throw error;
  }
};

export const updateBook = async (id: number, title: string, author: string, genre: string, isbn: string, totalCopies: number, availableCopies: number, cover: string) => {
  try {
    const res = await db
      .update(books)
      .set({
        title,
        author,
        genre,
        isbn,
        totalCopies,
        availableCopies,
        cover,
      })
      .where(eq(books.id, id));
    return res;
  } catch (error) {
    console.error("Error updating book:", error);
    throw error;
  }
};

export const readPhysicalBooks = async (bookId: number) => {
  try {
    const result = await db.select().from(physicalBooks).where(eq(physicalBooks.bookId, bookId));
    return result;
  } catch (error) {
    console.error("Error reading physical books:", error);
    throw error;
  }
};

export const fetchBooksByQuery = async (query: string, page: number = 1, pageSize: number = 10) => {
  try {
    const offset = (page - 1) * pageSize;

    const [searchResults, totalCount] = await Promise.all([
      db
        .select()
        .from(books)
        .where(
          sql`LOWER(title) LIKE LOWER(${"%" + query + "%"}) OR 
              LOWER(author) LIKE LOWER(${"%" + query + "%"}) OR 
              LOWER(isbn) LIKE LOWER(${"%" + query + "%"}) OR
              LOWER(genre) LIKE LOWER(${"%" + query + "%"})`
        )
        .orderBy(desc(books.id))
        .limit(pageSize)
        .offset(offset),
      db
        .select({ count: books.id })
        .from(books)
        .where(
          sql`LOWER(title) LIKE LOWER(${"%" + query + "%"}) OR 
              LOWER(author) LIKE LOWER(${"%" + query + "%"}) OR 
              LOWER(isbn) LIKE LOWER(${"%" + query + "%"}) OR
              LOWER(genre) LIKE LOWER(${"%" + query + "%"})`
        )
        .then((res) => res.length),
    ]);

    return {
      books: searchResults,
      totalPages: Math.ceil(totalCount / pageSize),
      currentPage: page,
      totalBooks: totalCount,
    };
  } catch (error) {
    console.error("Error searching books:", error);
    return {
      books: [],
      totalPages: 0,
      currentPage: page,
      totalBooks: 0,
    };
  }
};

export const readSingleBook = async (bookId: number) => {
  try {
    // First get the book details
    const book = await db.select().from(books).where(eq(books.id, bookId)).limit(1);

    if (!book || book.length === 0) {
      return null;
    }

    // Count available physical books (where borrowed = false)
    const availableCount = await db
      .select({ count: sql<number>`count(*)` })
      .from(physicalBooks)
      .where(and(eq(physicalBooks.bookId, bookId), eq(physicalBooks.borrowed, false)));

    // Combine book details with available count
    return {
      ...book[0],
      availableBooks: Number(availableCount[0].count),
    };
  } catch (error) {
    console.error("Error in readSingleBook:", error);
    throw error;
  }
};
